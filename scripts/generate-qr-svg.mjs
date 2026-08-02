import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import QRCode from 'qrcode-svg'

const toBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback
  }

  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
    return true
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
    return false
  }

  return fallback
}

const parseArgs = (args) => {
  const options = {
    text: '',
    out: 'qr.svg',
    width: 1024,
    height: 1024,
    padding: 0,
    ecl: 'M',
    color: '#000000',
    background: '',
    join: true,
    xmlDeclaration: true,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      continue
    }

    const key = arg.slice(2)
    const value = args[index + 1]

    if (key === 'help' || key === 'h') {
      options.help = true
      continue
    }

    if (value === undefined || value.startsWith('--')) {
      options[key] = true
      continue
    }

    options[key] = value
    index += 1
  }

  return {
    text: String(options.text || '').trim(),
    out: String(options.out || 'qr.svg').trim(),
    width: Number(options.width) || 1024,
    height: Number(options.height) || 1024,
    padding: Number(options.padding) || 0,
    ecl: String(options.ecl || 'M').toUpperCase(),
    color: String(options.color || '#000000').trim(),
    background: options.background === undefined ? '' : String(options.background).trim(),
    join: toBoolean(options.join, true),
    xmlDeclaration: toBoolean(options.xmlDeclaration, true),
    help: Boolean(options.help),
  }
}

const printHelp = () => {
  console.log(`Generate a QR code SVG for CNC/laser/3D workflows.

Usage:
  npm run qr:svg -- --text "https://example.com" --out qr.svg

Options:
  --text             Content to encode (required)
  --out              Output SVG path (default: qr.svg)
  --width            SVG width in px (default: 1024)
  --height           SVG height in px (default: 1024)
  --padding          Quiet zone in modules (default: 0)
  --ecl              Error correction L|M|Q|H (default: M)
  --color            Foreground color (default: #000000)
  --background       Background color (default: empty/none)
  --join             Merge adjacent modules (default: true)
  --xmlDeclaration   Include XML declaration (default: true)

Examples:
  npm run qr:svg -- --text "WIFI:T:WPA;S:MySSID;P:mypass;;" --out wifi.svg --ecl H
  npm run qr:svg -- --text "https://my-course.local" --out course-plate.svg --width 1400 --height 1400 --padding 2
`)
}

const run = async () => {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  if (!options.text) {
    console.error('Missing required --text value. Use --help for usage.')
    process.exitCode = 1
    return
  }

  if (!['L', 'M', 'Q', 'H'].includes(options.ecl)) {
    console.error('Invalid --ecl value. Use one of L, M, Q, H.')
    process.exitCode = 1
    return
  }

  const qr = new QRCode({
    content: options.text,
    width: options.width,
    height: options.height,
    padding: options.padding,
    ecl: options.ecl,
    color: options.color,
    background: options.background,
    join: options.join,
    xmlDeclaration: options.xmlDeclaration,
    container: 'none',
  })

  const rawSvg = qr.svg().trim().replace(/<rect\b[^>]*\/?>(?:<\/rect>)?/gi, '')
  const svg = rawSvg.startsWith('<svg')
    ? rawSvg.replace(/<rect\b[^>]*\/?>(?:<\/rect>)?/gi, '')
    : `${options.xmlDeclaration ? '<?xml version="1.0" standalone="yes"?>\n' : ''}<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${String(options.width)}" height="${String(options.height)}" viewBox="0 0 ${String(options.width)} ${String(options.height)}">${rawSvg}</svg>`
  const outputPath = path.resolve(process.cwd(), options.out)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, svg, 'utf8')

  console.log(`QR SVG written to ${outputPath}`)
  console.log(`Width x Height: ${options.width} x ${options.height}, ECL: ${options.ecl}, Join: ${String(options.join)}`)
}

void run()
