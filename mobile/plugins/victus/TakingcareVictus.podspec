Pod::Spec.new do |s|
  s.name = 'TakingcareVictus'
  s.version = '1.0.0'
  s.summary = 'Victus hydration widgets'
  s.license = { :type => 'Proprietary' }
  s.homepage = 'https://takingcare.pt'
  s.author = 'Taking Care'
  s.source = { :git => 'https://github.com/zamoriane/dieta-macros.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.swift'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
