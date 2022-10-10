// build.sbt
name := "scalatest_study"

version := "1.0"

scalaVersion := "2.13.9"

scalacOptions ++= Seq("-deprecation", "-feature", "-unchecked", "-Xlint")

libraryDependencies += "org.scalatest" %% "scalatest" % "3.2.14" % "test"

libraryDependencies += "dev.zio" %% "zio" % "2.0.2"
