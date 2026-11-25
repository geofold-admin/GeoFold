package app.geofold.raster

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * Rasterises a PDF page to a JPEG so a GeoPDF can be laid on the map as an image overlay.
 *
 * Android has had a PDF renderer in the platform since API 21 (PdfRenderer, backed by PDFium), so
 * this needs no third-party library — it is the reason a GeoPDF can be read on the phone at all.
 * The georeferencing is read separately, in JS, from the PDF's own dictionaries
 * (`src/lib/geopdf.ts`); this only turns the page into pixels.
 *
 * The page is rendered so its longer side is `maxSize` pixels. MapLibre uploads an image overlay
 * as one GPU texture, and 4096 is the safe ceiling across Android GPUs.
 */
class GeofoldRasterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GeofoldRaster")

    AsyncFunction("renderPdfPage") { uri: String, pageIndex: Int, maxSize: Int ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "The app is not ready to render.", null)

      val descriptor = openDescriptor(uri)
      try {
        val renderer = PdfRenderer(descriptor)
        try {
          if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
            throw CodedException("ERR_PAGE", "The PDF has ${renderer.pageCount} page(s); page ${pageIndex + 1} does not exist.", null)
          }
          val page = renderer.openPage(pageIndex)
          try {
            val pageWidth = page.width
            val pageHeight = page.height
            val longest = maxOf(pageWidth, pageHeight).coerceAtLeast(1)
            val scale = maxSize.coerceIn(256, 8192).toFloat() / longest
            val width = (pageWidth * scale).toInt().coerceAtLeast(1)
            val height = (pageHeight * scale).toInt().coerceAtLeast(1)

            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            // PDF pages are transparent where nothing is drawn; white is what a printed map shows.
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

            val out = File(context.cacheDir, "geopdf-${System.currentTimeMillis()}.jpg")
            FileOutputStream(out).use { stream -> bitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream) }
            bitmap.recycle()

            mapOf(
              "uri" to Uri.fromFile(out).toString(),
              "width" to width,
              "height" to height,
              "pageWidth" to pageWidth,
              "pageHeight" to pageHeight,
              "pageCount" to renderer.pageCount,
            )
          } finally {
            page.close()
          }
        } finally {
          renderer.close()
        }
      } catch (e: SecurityException) {
        throw CodedException("ERR_PROTECTED", "This PDF is password-protected. Remove the password and try again.", e)
      } finally {
        descriptor.close()
      }
    }
  }

  private fun openDescriptor(uri: String): ParcelFileDescriptor {
    val context = appContext.reactContext
      ?: throw CodedException("ERR_NO_CONTEXT", "The app is not ready to render.", null)
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      "content" -> context.contentResolver.openFileDescriptor(parsed, "r")
        ?: throw CodedException("ERR_OPEN", "Could not open the PDF.", null)
      else -> ParcelFileDescriptor.open(File(parsed.path ?: uri), ParcelFileDescriptor.MODE_READ_ONLY)
    }
  }
}
