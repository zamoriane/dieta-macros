# Run after Capacitor sync and the app's entitlement generation. Idempotent.
require 'xcodeproj'
require 'fileutils'
require 'json'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |t| t.name == 'App' } or abort 'Missing App target'
group_id = 'group.com.zamoriane.takingcare'
app_entitlements = 'ios/App/App/App.entitlements'
ent = Xcodeproj::Plist.read_from_path(app_entitlements)
ent['com.apple.security.application-groups'] = [group_id]
Xcodeproj::Plist.write_to_path(ent, app_entitlements)

dest = 'ios/App/VictusWidget'
FileUtils.mkdir_p(dest)
FileUtils.cp('widgets/ios/VictusWidget.swift', dest)
FileUtils.cp('plugins/victus/ios/Sources/VictusStore.swift', dest)
FileUtils.cp_r('widgets/ios/Assets.xcassets', dest)
Xcodeproj::Plist.write_to_path({
  'CFBundleDisplayName' => 'Victus', 'CFBundleName' => '$(PRODUCT_NAME)',
  'CFBundleIdentifier' => '$(PRODUCT_BUNDLE_IDENTIFIER)', 'CFBundleExecutable' => '$(EXECUTABLE_NAME)',
  'CFBundlePackageType' => 'XPC!', 'CFBundleShortVersionString' => '$(MARKETING_VERSION)',
  'CFBundleVersion' => '$(CURRENT_PROJECT_VERSION)',
  'NSExtension' => {'NSExtensionPointIdentifier' => 'com.apple.widgetkit-extension'}
}, "#{dest}/Info.plist")
Xcodeproj::Plist.write_to_path({'com.apple.security.application-groups' => [group_id]}, "#{dest}/VictusWidget.entitlements")

target = project.targets.find { |t| t.name == 'VictusWidget' } || project.new_target(:app_extension, 'VictusWidget', :ios, '17.0')
files = project.main_group.find_subpath('VictusWidget', true)
files.set_source_tree('<group>'); files.set_path('VictusWidget')
%w[VictusWidget.swift VictusStore.swift Assets.xcassets].each do |name|
  ref = files.files.find { |f| f.path == name } || files.new_file(name)
  phase = name.end_with?('.swift') ? target.source_build_phase : target.resources_build_phase
  phase.add_file_reference(ref) unless phase.files_references.include?(ref)
end
target.build_configurations.each do |c|
  c.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.zamoriane.takingcare.VictusWidget',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'INFOPLIST_FILE' => 'VictusWidget/Info.plist', 'CODE_SIGN_ENTITLEMENTS' => 'VictusWidget/VictusWidget.entitlements',
    'SWIFT_VERSION' => '5.9', 'IPHONEOS_DEPLOYMENT_TARGET' => '17.0',
    'APPLICATION_EXTENSION_API_ONLY' => 'YES', 'SKIP_INSTALL' => 'YES',
    'TARGETED_DEVICE_FAMILY' => '1', 'MARKETING_VERSION' => '1.0.0', 'CURRENT_PROJECT_VERSION' => '1'
  })
end
app.add_dependency(target) unless app.dependencies.any? { |d| d.target == target }
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed App Extensions' } || app.new_copy_files_build_phase('Embed App Extensions')
embed.dst_subfolder_spec = '13'
unless embed.files_references.include?(target.product_reference)
  build_file = embed.add_file_reference(target.product_reference)
  build_file.settings = {'ATTRIBUTES' => ['RemoveHeadersOnCopy']}
end
project.save

# Register our URL scheme without replacing Google sign-in URL types.
plist_path = 'ios/App/App/Info.plist'
plist = Xcodeproj::Plist.read_from_path(plist_path)
types = plist['CFBundleURLTypes'] ||= []
types << {'CFBundleURLSchemes' => ['takingcare']} unless types.any? { |t| (t['CFBundleURLSchemes'] || []).include?('takingcare') }
Xcodeproj::Plist.write_to_path(plist, plist_path)
puts 'Victus: widget extension, App Groups and deep link configured'
