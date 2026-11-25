import ExpoModulesCore
import PDFKit
import UIKit

/// iOS counterpart of the Android module: rasterises one PDF page to a JPEG with PDFKit, so a
/// GeoPDF can be laid on the map as an image overlay. Georeferencing is read in JS.
public class GeofoldRasterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GeofoldRaster")

    AsyncFunction("renderPdfPage") { (uri: String, pageIndex: Int, maxSize: Int) -> [String: Any] in
      guard let url = URL(string: uri), let document = PDFDocument(url: url) else {
        throw PdfOpenException()
      }
      if document.isLocked {
        throw PdfProtectedException()
      }
      guard pageIndex >= 0, pageIndex < document.pageCount, let page = document.page(at: pageIndex) else {
        throw PdfPageException()
      }

      let box = page.bounds(for: .cropBox)
      let quarterTurn = (page.rotation / 90) % 2 != 0
      let pageWidth = quarterTurn ? box.height : box.width
      let pageHeight = quarterTurn ? box.width : box.height
      let longest = max(pageWidth, pageHeight, 1)
      let scale = CGFloat(min(max(maxSize, 256), 8192)) / longest
      let target = CGSize(width: floor(pageWidth * scale), height: floor(pageHeight * scale))

      // thumbnail(of:for:) applies the page's /Rotate and draws on white — exactly what the JS
      // georeferencing assumes. Its pixel size can exceed `target` by the screen scale, so the
      // size reported back is read off the bitmap itself.
      let image = page.thumbnail(of: target, for: .cropBox)
      guard let cg = image.cgImage, let data = image.jpegData(compressionQuality: 0.9) else {
        throw PdfOpenException()
      }
      let out = FileManager.default.temporaryDirectory
        .appendingPathComponent("geopdf-\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
      try data.write(to: out)

      return [
        "uri": out.absoluteString,
        "width": cg.width,
        "height": cg.height,
        "pageWidth": Double(pageWidth),
        "pageHeight": Double(pageHeight),
        "pageCount": document.pageCount,
      ]
    }
  }
}

internal final class PdfOpenException: Exception {
  override var reason: String { "Could not open the PDF." }
}

internal final class PdfProtectedException: Exception {
  override var reason: String { "This PDF is password-protected. Remove the password and try again." }
}

internal final class PdfPageException: Exception {
  override var reason: String { "That page does not exist in the PDF." }
}
