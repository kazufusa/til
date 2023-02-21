import sbt._

object Dependencies {

  val mainAndTest = Seq(
    // MAIN
    "dev.zio" %% "zio" % Versions.zio,
    
    // TEST
    "org.scalatest" %% "scalatest" % Versions.scalatest % Test
  )
}
