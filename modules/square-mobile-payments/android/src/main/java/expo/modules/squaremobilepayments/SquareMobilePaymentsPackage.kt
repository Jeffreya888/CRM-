package expo.modules.squaremobilepayments

import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import com.squareup.sdk.mobilepayments.MobilePaymentsSdk
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/**
 * Starts Square's Mobile Payments SDK in Application.onCreate, as Square
 * requires, with the application ID the config plugin wrote to the manifest.
 */
class SquareMobilePaymentsPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        val appId = try {
          application.packageManager
            .getApplicationInfo(application.packageName, PackageManager.GET_META_DATA)
            .metaData?.getString("com.squareup.sdk.APPLICATION_ID")
        } catch (e: Exception) {
          null
        }
        if (!appId.isNullOrEmpty()) MobilePaymentsSdk.initialize(appId, application)
      }
    })
}
