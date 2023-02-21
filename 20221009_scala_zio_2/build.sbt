import Dependencies._

ThisBuild / scalaVersion := "2.13.10"
ThisBuild / organization := "com.cmartin.learn"

Global / onChangedBuildSource := ReloadOnSourceChanges

lazy val basicScalacOptions = Seq(       // some of the Rob Norris tpolecat options
    "-deprecation",                      // Emit warning and location for usages of deprecated APIs.
    "-encoding", "utf-8",                // Specify character encoding used by source files.
    "-explaintypes",                     // Explain type errors in more detail.
    "-feature",                          // Emit warning and location for usages of features that should be imported explicitly.
    "-unchecked",                        // Enable additional warnings where generated code depends on assumptions.
    "-language:higherKinds",             // Allow higher-kinded types
    "-language:implicitConversions",     // Allow definition of implicit functions called views
    "-language:postfixOps",
    "-Xlint:unused"
  )

lazy val commonSettings = Seq(
    libraryDependencies ++= mainAndTest,
    scalacOptions ++= basicScalacOptions
)

lazy val templateProject = (project in file("."))
  .settings(
      commonSettings,
      name := "project-template"
  )

 // clear screen and banner
 lazy val cls = taskKey[Unit]("Prints a separator")
 cls := {
   val brs = "\n" * 2
   val message = "* B U I L D   B E G I N S   H E R E *"
   val chars = "*" * message.length()
   println(s"$brs$chars")
   println("* B U I L D   B E G I N S   H E R E *")
   println(s"$chars$brs ")
 } 
