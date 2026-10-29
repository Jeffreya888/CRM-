// Config plugin for Square's Mobile Payments SDK (Tap to Pay and Square readers).
//
// Build-time environment (EAS: set in eas.json or as EAS environment variables):
//   EXPO_PUBLIC_SQUARE_APPLICATION_ID  Square application ID (sandbox-… for test builds).
//                                      Without it the SDK isn't started and in-person
//                                      payments stay hidden in the app.
//   SQUARE_TAP_TO_PAY_IOS=1            Adds Apple's Tap to Pay on iPhone entitlement. Only set
//                                      it after Apple approves the entitlement for this app,
//                                      or iOS signing fails.
const {
  AndroidConfig,
  withAndroidManifest,
  withEntitlementsPlist,
  withGradleProperties,
  withInfoPlist,
  withPodfile,
  withProjectBuildGradle,
} = require('expo/config-plugins');

const SQUARE_MAVEN = "maven { url 'https://sdk.squareup.com/public/android/' }";
const PHASE = 'Square Mobile Payments setup';

const withSquareIos = (config, { appId, tapToPay, bluetooth, location, microphone }) => {
  config = withInfoPlist(config, (c) => {
    if (appId) c.modResults.SquareApplicationID = appId;
    c.modResults.NSBluetoothAlwaysUsageDescription ??= bluetooth;
    c.modResults.NSLocationWhenInUseUsageDescription ??= location;
    c.modResults.NSMicrophoneUsageDescription ??= microphone;
    return c;
  });
  if (tapToPay) {
    config = withEntitlementsPlist(config, (c) => {
      c.modResults['com.apple.developer.proximity-reader.payment.acceptance'] = true;
      return c;
    });
  }
  // Square's SDK ships a setup script that must run after the frameworks are
  // embedded (CocoaPods adds that phase at install time, so place ours after it).
  return withPodfile(config, (c) => {
    if (c.modResults.contents.includes(PHASE)) return c;
    const hook = `
# ${PHASE}: run the SDK's setup script after "[CP] Embed Pods Frameworks".
post_integrate do |installer|
  installer.aggregate_targets.map(&:user_project).uniq.each do |project|
    project.native_targets.each do |target|
      next unless target.product_type == 'com.apple.product-type.application'
      phase = target.shell_script_build_phases.find { |p| p.name == '${PHASE}' } || target.new_shell_script_build_phase('${PHASE}')
      phase.shell_script = <<~'SH'
        SETUP_SCRIPT="\${BUILT_PRODUCTS_DIR}/\${FRAMEWORKS_FOLDER_PATH}/SquareMobilePaymentsSDK.framework/setup"
        if [ -f "$SETUP_SCRIPT" ]; then
          "$SETUP_SCRIPT"
        fi
      SH
      target.build_phases.delete(phase)
      target.build_phases << phase
    end
    project.save
  end
end
`;
    c.modResults.contents += hook;
    return c;
  });
};

// Square's Android SDK is built with Kotlin 2.2 (Expo 57 supports 2.2.21).
const KOTLIN = '2.2.21';

const withSquareAndroid = (config, { appId }) => {
  config = withGradleProperties(config, (c) => {
    if (!c.modResults.some((p) => p.type === 'property' && p.key === 'android.kotlinVersion')) {
      c.modResults.push({ type: 'property', key: 'android.kotlinVersion', value: KOTLIN });
    }
    return c;
  });
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_PHONE_STATE',
  ]);
  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    if (appId) AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.squareup.sdk.APPLICATION_ID', appId);
    return c;
  });
  return withProjectBuildGradle(config, (c) => {
    if (c.modResults.contents.includes('sdk.squareup.com')) return c;
    c.modResults.contents = c.modResults.contents.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      (m) => `${m}\n    ${SQUARE_MAVEN}`,
    );
    if (!c.modResults.contents.includes('sdk.squareup.com')) {
      c.modResults.contents += `\nallprojects {\n  repositories {\n    ${SQUARE_MAVEN}\n  }\n}\n`;
    }
    return c;
  });
};

module.exports = function withSquareMobilePayments(config, props = {}) {
  const opts = {
    appId: props.applicationId ?? process.env.EXPO_PUBLIC_SQUARE_APPLICATION_ID ?? '',
    tapToPay: props.tapToPay ?? process.env.SQUARE_TAP_TO_PAY_IOS === '1',
    bluetooth: props.bluetoothPermission ?? 'Bluetooth connects your Square card reader to take customer payments.',
    location: props.locationPermission ?? 'Square uses your location to confirm card payments are taken where your business operates.',
    microphone: props.microphonePermission ?? 'The microphone is used only by Square magstripe readers that plug into the headphone jack.',
  };
  config = withSquareIos(config, opts);
  config = withSquareAndroid(config, opts);
  return config;
};
