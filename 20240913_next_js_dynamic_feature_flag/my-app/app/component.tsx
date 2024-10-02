"use client";
// import appConfig from "./appConfig";
import {isProduction} from "./config"

export default function Component() {
  return (
    <div>
      {/* Hello! {appConfig.isProduction ? "PRODUCTION" : "DEVELOPMENT"} */}
    {
      isProduction ? "TEST_PRODUCTION" : "TEST_DEVELOPMENT"
    }
      {/* {appConfig.featureFlag && ( */}
      {/*   <div style={{ background: "red" }}>NEW FEATURE</div> */}
      {/* )} */}
    </div>
  );
}
