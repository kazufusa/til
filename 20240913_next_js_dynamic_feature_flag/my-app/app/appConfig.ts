class AppConfig {
  private constructor(
    readonly isProduction = process.env.NEXT_PUBLIC_MODE === "production",
    readonly featureFlag = process.env.NEXT_PUBLIC_FEATURE_FLAG === "enabled",
  ) {
  }

  static instance = new AppConfig();
}

    // this.featureFlag = this.isProduction
    //   ? process.env.NEXT_PUBLIC_FEATURE_FLAG === "enabled"
    //   : queryFeatureFlag();

// function queryFeatureFlag() {
//   if (typeof window === "undefined") {
//     return false;
//   }
//   const url = new URL(window.location.href)
//   return !(url.searchParams.get("featureFlag") === "disabled");
// }


export default AppConfig.instance
