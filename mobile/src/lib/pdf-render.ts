import { requireOptionalNativeModule } from 'expo';

/**
 * PDF page → JPEG, through the local `geofold-raster` native module (`native/geofold-raster`).
 *
 * Optional on purpose: an APK built before the module existed still runs, and the overlay screen
 * says a rebuild is needed instead of crashing.
 */

export interface RenderedPage {
  uri: string;
  width: number;
  height: number;
  /** Page size in PDF points, after the page's /Rotate. */
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
}

const Native = requireOptionalNativeModule<{
  renderPdfPage(uri: string, pageIndex: number, maxSize: number): Promise<RenderedPage>;
}>('GeofoldRaster');

export const PDF_RENDER_AVAILABLE = Native !== null;

export async function renderPdfPage(uri: string, pageIndex = 0, maxSize = 4096): Promise<RenderedPage> {
  if (!Native) {
    throw new Error('Reading PDF maps needs the latest GeoFold build — this one was built without the PDF renderer.');
  }
  return Native.renderPdfPage(uri, pageIndex, maxSize);
}
