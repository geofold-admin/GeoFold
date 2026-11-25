Pod::Spec.new do |s|
  s.name           = 'GeofoldRaster'
  s.version        = '0.1.0'
  s.summary        = 'PDF page rasteriser for GeoFold map overlays'
  s.author         = 'GeoFold'
  s.homepage       = 'https://geofold.sayba.id'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.{h,m,swift}'
end
