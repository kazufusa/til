package com.cmartin.learn

import com.cmartin.learn.Library._
import zio._

object SimpleApp
    extends ZIOAppDefault {

  val logAspect = ZIOAspect.loggedWith[Int](r => s"sum result: $r")

  def run = {
    for {
      _      <- ZIO.log(echo(TEXT))
      result <- sum(2, 3) @@ logAspect
    } yield ()
  }
}
