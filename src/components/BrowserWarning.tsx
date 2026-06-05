export default function BrowserWarning() {
  const isChromium = /Chrome|Chromium|Edge/i.test(navigator.userAgent) && !/Firefox|Safari/i.test(navigator.userAgent)
  if (isChromium) return null
  return (
    <div className="bg-amber-100 border-b-2 border-amber-500 px-4 py-2 text-center text-sm text-amber-900">
      <span className="font-semibold">שים לב:</span> הדפסה Bluetooth דורשת דפדפן Chrome או Edge.
      <span className="text-amber-700 mr-1">Bluetooth printing requires Chrome or Edge browser.</span>
    </div>
  )
}
