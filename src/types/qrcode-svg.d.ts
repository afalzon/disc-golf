declare module 'qrcode-svg' {
  type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

  type QRCodeSvgOptions = {
    content: string
    width?: number
    height?: number
    padding?: number
    ecl?: ErrorCorrectionLevel
    join?: boolean
    color?: string
    background?: string
    container?: 'svg' | 'svg-viewbox' | 'g' | 'none'
    xmlDeclaration?: boolean
  }

  export default class QRCode {
    constructor(options: QRCodeSvgOptions)
    svg(): string
  }
}
