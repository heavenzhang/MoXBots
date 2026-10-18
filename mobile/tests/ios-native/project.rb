require 'xcodeproj'

repo, output, framework = ARGV
raise 'repo/output/framework required' unless framework && File.directory?(framework)
project = Xcodeproj::Project.new(File.join(output, 'NativeValidation.xcodeproj'))
host = project.new_target(:application, 'MoxNativeValidationHost', :ios, '16.4')
tests = project.new_target(:unit_test_bundle, 'NativeOwnersTests', :ios, '16.4')
host_info = File.join(output, 'HostInfo.plist')
Xcodeproj::Plist.write_to_path({
  'CFBundleExecutable' => '$(EXECUTABLE_NAME)', 'CFBundleIdentifier' => '$(PRODUCT_BUNDLE_IDENTIFIER)',
  'CFBundleName' => '$(PRODUCT_NAME)', 'CFBundlePackageType' => 'APPL',
  'CFBundleShortVersionString' => '1.0', 'CFBundleVersion' => '1',
  'UIApplicationSceneManifest' => {
    'UIApplicationSupportsMultipleScenes' => false,
    'UISceneConfigurations' => { 'UIWindowSceneSessionRoleApplication' => [{
      'UISceneConfigurationName' => 'Native validation',
      'UISceneDelegateClassName' => '$(PRODUCT_MODULE_NAME).ValidationSceneDelegate',
    }] },
  },
}, host_info)
[[host, 'com.moxbots.native-validation-host'], [tests, 'com.moxbots.native-validation-tests']].each do |target, bundle|
  target.build_configurations.each do |config|
    config.build_settings.merge!({
      'PRODUCT_BUNDLE_IDENTIFIER' => bundle, 'SWIFT_VERSION' => '5.9',
      'GENERATE_INFOPLIST_FILE' => 'YES', 'CODE_SIGN_IDENTITY' => '-',
      'TARGETED_DEVICE_FAMILY' => '1,2', 'ENABLE_USER_SCRIPT_SANDBOXING' => 'YES',
      'SUPPORTED_PLATFORMS' => 'iphonesimulator', 'ONLY_ACTIVE_ARCH' => 'YES',
    })
  end
end
host.build_configurations.each do |config|
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  config.build_settings['INFOPLIST_FILE'] = host_info
end
host.add_file_references([project.main_group.new_file(File.join(repo, 'mobile/tests/ios-native/Host.swift'))])
files = ['SecureRecords.swift', 'NativeConnection.swift', 'NativeAttachments.swift'].map do |name|
  File.join(repo, 'mobile/app/modules/moxbots-remote/ios', name)
end
files << File.join(repo, 'mobile/tests/ios-native/NativeOwnersTests.swift')
tests.add_file_references(files.map { |file| project.main_group.new_file(file) })
tests.add_dependency(host)
tests.build_configurations.each do |config|
  config.build_settings.merge!({
    'TEST_HOST' => '$(BUILT_PRODUCTS_DIR)/MoxNativeValidationHost.app/MoxNativeValidationHost',
    'BUNDLE_LOADER' => '$(TEST_HOST)',
    'FRAMEWORK_SEARCH_PATHS' => ['$(inherited)', File.dirname(framework)],
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks'],
    'OTHER_LDFLAGS' => ['$(inherited)', '-framework', 'MoxConnectionCore', '-framework', 'Security',
      '-framework', 'SystemConfiguration', '-framework', 'Network', '-framework', 'CoreFoundation'],
  })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(host)
scheme.add_build_target(tests, false)
scheme.add_test_target(tests)
scheme.test_action.build_configuration = 'Release'
scheme.test_action.should_use_launch_scheme_args_env = false
if ENV['MOXBOTS_LIVE_LOGIN_ORIGIN']
  scheme.test_action.environment_variables = Xcodeproj::XCScheme::EnvironmentVariables.new([
    { :key => 'MOXBOTS_LIVE_LOGIN_ORIGIN', :value => ENV.fetch('MOXBOTS_LIVE_LOGIN_ORIGIN'), :enabled => true },
  ])
end
scheme.save_as(project.path, 'NativeOwnersTests')
