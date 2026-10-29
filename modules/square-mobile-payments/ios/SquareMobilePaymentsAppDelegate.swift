import ExpoModulesCore
import SquareMobilePaymentsSDK

/// Starts Square's Mobile Payments SDK at launch, as Square requires, with the
/// application ID the config plugin wrote to Info.plist. Builds without a
/// Square application ID skip it (in-person payments then stay hidden).
public class SquareMobilePaymentsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if let appId = Bundle.main.object(forInfoDictionaryKey: "SquareApplicationID") as? String, !appId.isEmpty {
      MobilePaymentsSDK.initialize(applicationLaunchOptions: launchOptions, squareApplicationID: appId)
    }
    return true
  }
}
