import type { Order, MenuItem } from '../types'

const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb'
const CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb'
// Fallback SPP-style UUIDs some printers use
const ALT_SERVICE = 0x18f0
const ALT_CHAR = 0x2af1

const ESC = 0x1b
const GS = 0x1d

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes)
}

const INIT = cmd(ESC, 0x40)
const BOLD_ON = cmd(ESC, 0x45, 0x01)
const BOLD_OFF = cmd(ESC, 0x45, 0x00)
const CENTER = cmd(ESC, 0x61, 0x01)
const LEFT = cmd(ESC, 0x61, 0x00)
const LF = cmd(0x0a)
const CUT = cmd(GS, 0x56, 0x41, 0x10)

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

function rightAlign(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length
  return left + ' '.repeat(Math.max(1, gap)) + right
}

export class BluetoothPrinter {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null

  get isConnected(): boolean {
    return this.device?.gatt?.connected ?? false
  }

  async connect(): Promise<void> {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth not supported')

    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID, ALT_SERVICE],
    }).catch(() =>
      navigator.bluetooth!.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID, ALT_SERVICE],
      })
    )

    const server = await this.device.gatt!.connect()

    let service: BluetoothRemoteGATTService
    try {
      service = await server.getPrimaryService(SERVICE_UUID)
    } catch {
      service = await server.getPrimaryService(ALT_SERVICE)
    }

    try {
      this.characteristic = await service.getCharacteristic(CHAR_UUID)
    } catch {
      this.characteristic = await service.getCharacteristic(ALT_CHAR)
    }

    this.device.addEventListener('gattserverdisconnected', () => {
      this.characteristic = null
    })
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect()
    this.characteristic = null
    this.device = null
  }

  private async write(data: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error('Printer not connected')
    const CHUNK = 512
    for (let i = 0; i < data.length; i += CHUNK) {
      await this.characteristic.writeValue(data.slice(i, i + CHUNK))
    }
  }

  async printKitchenTicket(order: Order, menuItems: MenuItem[]): Promise<void> {
    const W = 32
    const SEP = '='.repeat(W)
    const DASH = '-'.repeat(W)

    const date = new Date(order.paidAt || order.createdAt)
    const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    const dateStr = date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const typeEn = order.orderType === 'sit_down' ? 'SIT DOWN' : 'TAKE AWAY'
    const typeHe = order.orderType === 'sit_down' ? 'ישיבה' : 'לקחת'

    const parts: Uint8Array[] = [
      INIT,
      CENTER,
      BOLD_ON,
      encode(SEP + '\n'),
      encode('       YUU POP-UP\n'),
      encode(`  ${order.id}\n`),
      encode(`  ${typeHe} / ${typeEn}\n`),
      encode(`  * שולם / PAID * ${timeStr}\n`),
      encode(`  ${dateStr}\n`),
      encode(SEP + '\n'),
      BOLD_OFF,
      LEFT,
    ]

    for (const oi of order.items) {
      const mi = menuItems.find(m => m.id === oi.menuItemId)
      if (!mi) continue
      const label = `${oi.quantity}x  ${mi.name}`
      const price = `${mi.price * oi.quantity}`
      parts.push(encode(rightAlign(label, price, W) + '\n'))
      if (oi.notes) parts.push(encode(`     (${oi.notes})\n`))
    }

    parts.push(
      encode(DASH + '\n'),
      BOLD_ON,
      encode(rightAlign('    TOTAL:', `${order.totalPrice}`, W) + '\n'),
      BOLD_OFF,
      encode(SEP + '\n'),
      LF, LF, LF,
      CUT,
    )

    await this.write(concat(...parts))
  }

  async testPrint(): Promise<void> {
    const W = 32
    const SEP = '='.repeat(W)
    const data = concat(
      INIT, CENTER, BOLD_ON,
      encode(SEP + '\n'),
      encode('    YUU — TEST PRINT\n'),
      encode('     מדפסת מחוברת!\n'),
      encode(SEP + '\n'),
      BOLD_OFF,
      LF, LF, LF,
      CUT,
    )
    await this.write(data)
  }
}

export const printer = new BluetoothPrinter()
