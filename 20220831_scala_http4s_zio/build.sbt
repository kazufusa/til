ThisBuild / scalaVersion := "2.13.8"

val http4sVersion = "0.23.15"

libraryDependencies ++= Seq(
  "org.http4s" %% "http4s-dsl",
  "org.http4s" %% "http4s-ember-client",
  "org.http4s" %% "http4s-circe"
).map(_ % http4sVersion)

val circeVersion = "0.14.1"

libraryDependencies ++= Seq(
  "io.circe" %% "circe-core",
  "io.circe" %% "circe-generic",
  "io.circe" %% "circe-literal"
).map(_ % circeVersion)

libraryDependencies += "dev.zio" %% "zio" % "2.0.1"
