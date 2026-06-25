import type { Order, MenuItem } from '../types'

// GB01/PeriPage protocol (service 0xae30, characteristic 0xae01)
// Packet format: 51 78 [CMD] 00 [LEN_LO] [LEN_HI] [DATA…] [CRC8] FF
const SERVICE_UUID    = '0000ae30-0000-1000-8000-00805f9b34fb'
const CHAR_WRITE_UUID = '0000ae01-0000-1000-8000-00805f9b34fb'
const LAST_DEVICE_KEY = 'yuu_printer_device_name'

const PRINT_WIDTH   = 384   // bytes sent per row (48 bytes = 384 bits, full protocol width)
const RENDER_WIDTH  = 368   // canvas render width — 16px right margin avoids edge clipping
const CMD_PRINT_ROW  = 0xA2
const CMD_FEED       = 0xA1
const CMD_SET_ENERGY = 0xBD

// ── CRC-8 (polynomial 0x07) ──────────────────────────────────
function crc8(data: Uint8Array): number {
  let crc = 0
  for (const b of data) {
    crc ^= b
    for (let i = 0; i < 8; i++)
      crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) & 0xFF : (crc << 1) & 0xFF
  }
  return crc
}

// ── GB01 packet builder ──────────────────────────────────────
function gb01Packet(cmd: number, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const pkt = new Uint8Array(8 + data.length)
  pkt[0] = 0x51; pkt[1] = 0x78; pkt[2] = cmd; pkt[3] = 0x00
  pkt[4] = data.length & 0xFF
  pkt[5] = (data.length >> 8) & 0xFF
  pkt.set(data, 6)
  pkt[6 + data.length] = data.length > 0 ? crc8(data) : 0x00
  pkt[7 + data.length] = 0xFF
  return pkt
}

// ── Canvas → bitmap rows ─────────────────────────────────────
// LSB-first bit packing: bit 0 of byte[0] = leftmost pixel.
function rasterize(canvas: HTMLCanvasElement): Uint8Array[] {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const rows: Uint8Array[] = []
  for (let row = 0; row < canvas.height; row++) {
    const bytes = new Uint8Array(PRINT_WIDTH / 8)
    for (let col = 0; col < canvas.width; col++) {
      const idx = (row * canvas.width + col) * 4
      if ((img.data[idx] + img.data[idx + 1] + img.data[idx + 2]) / 3 < 128) {
        bytes[Math.floor(col / 8)] |= (1 << (col % 8))
      }
    }
    rows.push(bytes)
  }
  return rows
}

// ── LTR English rendering ────────────────────────────────────
function renderLTR(lines: string[], fontSize: number): Uint8Array[] {
  const lineH  = Math.ceil(fontSize * 1.5)
  const canvas = document.createElement('canvas')
  canvas.width  = RENDER_WIDTH
  canvas.height = lines.length * lineH + 20
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'black'
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => ctx.fillText(line, 4, i * lineH + 10))
  return rasterize(canvas)
}

// ── RTL Hebrew rendering ─────────────────────────────────────
// Each row is either a plain string (right-aligned) or [leftText, rightText]
// where leftText (price) is drawn left-aligned and rightText (item) is right-aligned RTL.
type HeBonRow = string | [string, string]

function renderRTL(rows: HeBonRow[], fontSize: number): Uint8Array[] {
  const lineH = Math.ceil(fontSize * 1.6)
  const canvas = document.createElement('canvas')
  canvas.width  = RENDER_WIDTH
  canvas.height = rows.length * lineH + 24
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'black'
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`
  ctx.textBaseline = 'top'

  rows.forEach((row, i) => {
    const y = i * lineH + 12
    if (Array.isArray(row)) {
      const [left, right] = row
      // Price on left (LTR)
      ctx.direction = 'ltr'; ctx.textAlign = 'left'
      ctx.fillText(left, 4, y)
      // Item name on right (RTL — Hebrew flows naturally right-to-left)
      ctx.direction = 'rtl'; ctx.textAlign = 'right'
      ctx.fillText(right, RENDER_WIDTH - 4, y)
    } else {
      ctx.direction = 'rtl'; ctx.textAlign = 'right'
      ctx.fillText(row, RENDER_WIDTH - 4, y)
    }
  })
  return rasterize(canvas)
}

// ── Text wrapping for long notes ─────────────────────────────
function wrapNotes(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const lines: string[] = []
  let remaining = text
  while (remaining.length > maxChars) {
    let breakAt = remaining.lastIndexOf(',', maxChars)
    if (breakAt < 1) breakAt = remaining.lastIndexOf(' ', maxChars)
    if (breakAt < 1) breakAt = maxChars
    lines.push(remaining.slice(0, breakAt + 1).trim())
    remaining = remaining.slice(breakAt + 1).trim()
  }
  if (remaining) lines.push(remaining)
  return lines
}

export class BluetoothPrinter {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private printQueue: Array<() => Promise<void>> = []
  private isPrinting = false

  get isConnected(): boolean {
    return this.device?.gatt?.connected ?? false
  }

  get lastDeviceName(): string | null {
    return localStorage.getItem(LAST_DEVICE_KEY)
  }

  async tryAutoReconnect(): Promise<boolean> {
    if (!navigator.bluetooth?.getDevices) return false
    try {
      const devices  = await navigator.bluetooth.getDevices()
      const lastName = this.lastDeviceName
      const target   = (lastName ? devices.find(d => d.name === lastName) : null) ?? devices[0]
      if (!target) return false
      const server = await target.gatt!.connect()
      const char   = await this._findChar(server)
      if (!char) { target.gatt!.disconnect(); return false }
      this.device = target
      this.characteristic = char
      this._watchDisconnect()
      return true
    } catch {
      return false
    }
  }

  async connect(): Promise<void> {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth not supported')

    // Show all nearby Bluetooth devices — the user picks their printer by name.
    // A service-UUID filter is avoided because many printers don't advertise the
    // service UUID until after pairing, causing an empty (confusing) chooser.
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID],
    })

    const server = await this.device.gatt!.connect()
    const char   = await this._findChar(server)

    if (!char) {
      this.device.gatt!.disconnect()
      this.device = null
      throw new Error('Printer connected but write characteristic not found.')
    }

    this.characteristic = char
    localStorage.setItem(LAST_DEVICE_KEY, this.device.name ?? '')
    this._watchDisconnect()
  }

  private async _findChar(
    server: BluetoothRemoteGATTServer,
  ): Promise<BluetoothRemoteGATTCharacteristic | null> {
    try {
      const service = await server.getPrimaryService(SERVICE_UUID)
      const chars   = await service.getCharacteristics()
      return chars.find(c => c.uuid === CHAR_WRITE_UUID)
          ?? chars.find(c => c.properties.writeWithoutResponse)
          ?? chars.find(c => c.properties.write)
          ?? null
    } catch {
      return null
    }
  }

  private _watchDisconnect() {
    this.device?.addEventListener('gattserverdisconnected', () => {
      this.characteristic = null
    })
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect()
    this.characteristic = null
    this.device = null
  }

  private async writePkt(pkt: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error('Printer not connected')
    const CHUNK = 100
    for (let i = 0; i < pkt.length; i += CHUNK) {
      await this.characteristic.writeValueWithoutResponse(pkt.slice(i, i + CHUNK))
      await new Promise(r => setTimeout(r, 5))
    }
  }

  private async printBitmap(rows: Uint8Array[]): Promise<void> {
    await this.writePkt(gb01Packet(CMD_SET_ENERGY, new Uint8Array([0x35])))
    await new Promise(r => setTimeout(r, 100))

    // Skip blank rows and replace runs of them with a single fast feed command.
    let blankCount = 0
    for (const row of rows) {
      if (row.every(b => b === 0)) {
        blankCount++
        continue
      }
      if (blankCount > 0) {
        await this.writePkt(gb01Packet(CMD_FEED, new Uint8Array([Math.min(blankCount, 255)])))
        await new Promise(r => setTimeout(r, 5))
        blankCount = 0
      }
      await this.writePkt(gb01Packet(CMD_PRINT_ROW, row))
      await new Promise(r => setTimeout(r, 2))
    }

    // Trailing feed: remaining blank rows + 80 lines (~1 cm) so printout clears the cutter
    await new Promise(r => setTimeout(r, 100))
    await this.writePkt(gb01Packet(CMD_FEED, new Uint8Array([Math.min(blankCount + 80, 255)])))
  }

  // Enqueue a kitchen ticket — the queue ensures only one job prints at a time.
  async enqueuePrint(order: Order, menuItems: MenuItem[], printInHebrew = false): Promise<void> {
    this.printQueue.push(() => this.printKitchenTicket(order, menuItems, printInHebrew))
    this._drainQueue()
  }

  private async _drainQueue(): Promise<void> {
    if (this.isPrinting) return
    this.isPrinting = true
    try {
      while (this.printQueue.length > 0) {
        const job = this.printQueue.shift()!
        try { await job() } catch (e) { console.warn('Print failed:', e) }
      }
    } finally {
      this.isPrinting = false
    }
  }

  async testPrint(): Promise<void> {
    await this.printBitmap(renderLTR([
      '==============================',
      '       YUU -- TEST PRINT',
      '       Printer connected!',
      '==============================',
    ], 20))
  }

  async printKitchenTicket(order: Order, menuItems: MenuItem[], printInHebrew = false): Promise<void> {
    const SEP  = '=============================='
    const SEP2 = '------------------------------'

    const date    = new Date(order.paidAt || order.createdAt)
    const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    const isStaff = order.paymentMethod === 'staff'

    // Top padding ~1.5 cm before content starts
    await this.writePkt(gb01Packet(CMD_SET_ENERGY, new Uint8Array([0x35])))
    await new Promise(r => setTimeout(r, 100))
    await this.writePkt(gb01Packet(CMD_FEED, new Uint8Array([120])))
    await new Promise(r => setTimeout(r, 30))

    if (printInHebrew) {
      const typeHe     = order.orderType === 'sit_down' ? 'ישיבה' : 'לקחת'
      const paymentStr = isStaff ? '★ על החשבון ★' : `★ שולם ★  ${timeStr}`

      const rows: HeBonRow[] = [
        SEP,
        'YUU POP-UP',
        SEP2,
        `${order.id}   ${typeHe}`,
        paymentStr,
        SEP,
      ]

      if (order.customerName) {
        rows.push(`★★  ${order.customerName}  ★★`)
        rows.push(SEP)
      }

      for (const oi of order.items) {
        const mi = menuItems.find(m => m.id === oi.menuItemId)
        if (!mi) continue
        rows.push([`₪${mi.price * oi.quantity}`, `${oi.quantity}×  ${mi.nameHe}`])
        if (oi.notes) {
          // Wrap long notes, indent each continuation line
          wrapNotes(oi.notes, 22).forEach((l, idx) =>
            rows.push(idx === 0 ? `  (${l}` : `   ${l}`)
          )
          // Close the parenthesis on the last line
          const lastIdx = rows.length - 1
          if (typeof rows[lastIdx] === 'string') {
            rows[lastIdx] = (rows[lastIdx] as string) + ')'
          }
        }
      }

      rows.push(SEP2)
      rows.push([`₪${order.totalPrice}`, 'סה"כ'])
      rows.push(SEP)

      await this.printBitmap(renderRTL(rows, 20))
    } else {
      const W          = 30
      const typeEn     = order.orderType === 'sit_down' ? 'SIT DOWN' : 'TAKE AWAY'
      const paymentStr = isStaff ? '★ ON THE HOUSE ★' : `★ PAID ★  ${timeStr}`
      const pad = (l: string, r: string) => l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r

      const lines: string[] = [
        SEP,
        '         YUU POP-UP',
        SEP2,
        `  Order: ${order.id}`,
        `  ${typeEn}`,
        `  ${paymentStr}`,
        SEP,
      ]

      if (order.customerName) {
        lines.push(`** ${order.customerName.toUpperCase()} **`)
        lines.push(SEP)
      }

      for (const oi of order.items) {
        const mi = menuItems.find(m => m.id === oi.menuItemId)
        if (!mi) continue
        lines.push(pad(`  ${oi.quantity}x  ${mi.name}`, `${mi.price * oi.quantity}`))
        if (oi.notes) {
          wrapNotes(oi.notes, W - 8).forEach((l, idx) =>
            lines.push(idx === 0 ? `       (${l}` : `        ${l}`)
          )
          lines[lines.length - 1] += ')'
        }
      }

      lines.push(SEP2)
      lines.push(pad('    TOTAL:', `${order.totalPrice}`))
      lines.push(SEP)

      await this.printBitmap(renderLTR(lines, 20))
    }
  }
}

export const printer = new BluetoothPrinter()
