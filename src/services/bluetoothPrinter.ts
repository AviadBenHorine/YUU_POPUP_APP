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

// ── Text → bitmap rows ───────────────────────────────────────
// Returns one Uint8Array (48 bytes) per pixel row.
// Uses LSB-first bit packing: bit 0 of byte[0] = leftmost pixel.
function renderTextToBitmap(lines: string[], fontSize: number): Uint8Array[] {
  const lineH  = Math.ceil(fontSize * 1.5)
  const canvas = document.createElement('canvas')
  canvas.width  = RENDER_WIDTH  // narrower than PRINT_WIDTH — right 16px stays blank (no edge clipping)
  canvas.height = lines.length * lineH + 20
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'black'
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => ctx.fillText(line, 4, i * lineH + 10))

  const img  = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const rows: Uint8Array[] = []
  for (let row = 0; row < canvas.height; row++) {
    const bytes = new Uint8Array(PRINT_WIDTH / 8)  // always 48 bytes for protocol
    for (let col = 0; col < canvas.width; col++) {  // only render up to RENDER_WIDTH; rest stays 0x00
      const idx = (row * canvas.width + col) * 4
      if ((img.data[idx] + img.data[idx + 1] + img.data[idx + 2]) / 3 < 128) {
        bytes[Math.floor(col / 8)] |= (1 << (col % 8))
      }
    }
    rows.push(bytes)
  }
  return rows
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

    // Try filtering by known service first so the picker is pre-filtered.
    // Fall back to acceptAllDevices if the filter yields no results.
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID],
    }).catch(() =>
      navigator.bluetooth!.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      })
    )

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
      // Prefer ae01 (the dedicated write-no-response print data char)
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
    // This dramatically reduces BLE writes — most canvas rows are blank inter-line space.
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
  // Callers can fire-and-forget; errors are logged but don't stall the queue.
  async enqueuePrint(order: Order, menuItems: MenuItem[]): Promise<void> {
    this.printQueue.push(() => this.printKitchenTicket(order, menuItems))
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
    await this.printBitmap(renderTextToBitmap([
      '==============================',
      '       YUU -- TEST PRINT',
      '       Printer connected!',
      '==============================',
    ], 20))
  }

  async printKitchenTicket(order: Order, menuItems: MenuItem[]): Promise<void> {
    const W   = 30
    const pad = (l: string, r: string) => l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r

    const date    = new Date(order.paidAt || order.createdAt)
    const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    const typeEn  = order.orderType === 'sit_down' ? 'SIT DOWN' : 'TAKE AWAY'

    const lines: string[] = [
      '==============================',
      '         YUU POP-UP',
      `  Order: ${order.id}`,
      `  ${typeEn}`,
      `  * PAID * ${timeStr}`,
      '==============================',
    ]

    for (const oi of order.items) {
      const mi = menuItems.find(m => m.id === oi.menuItemId)
      if (!mi) continue
      lines.push(pad(`  ${oi.quantity}x  ${mi.name}`, `${mi.price * oi.quantity}`))
      if (oi.notes) lines.push(`       (${oi.notes})`)
    }

    lines.push('------------------------------')
    lines.push(pad('    TOTAL:', `${order.totalPrice}`))
    lines.push('==============================')

    await this.printBitmap(renderTextToBitmap(lines, 20))
  }
}

export const printer = new BluetoothPrinter()
