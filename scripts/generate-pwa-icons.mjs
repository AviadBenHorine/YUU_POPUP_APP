// Generates PNG icons for PWA from the navy+gold YUU brand
import sharp from 'sharp'
import { writeFileSync } from 'fs'

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
]

function makeSvg(size, maskable = false) {
  const pad = maskable ? Math.round(size * 0.1) : 0
  const inner = size - pad * 2
  const r = maskable ? 0 : Math.round(size * 0.2)
  const fontSize = Math.round(inner * 0.42)
  const y = Math.round(size / 2 + fontSize * 0.35)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#1A2340" rx="${r}"/>
  <text
    x="${size / 2}" y="${y}"
    font-family="Arial Black, Arial, sans-serif"
    font-weight="900"
    font-size="${fontSize}"
    fill="#C8A96E"
    text-anchor="middle"
    letter-spacing="-2"
  >YUU</text>
</svg>`
}

for (const { name, size, maskable } of sizes) {
  const svg = Buffer.from(makeSvg(size, maskable))
  await sharp(svg).png().toFile(`public/${name}`)
  console.log(`✓ public/${name}`)
}
