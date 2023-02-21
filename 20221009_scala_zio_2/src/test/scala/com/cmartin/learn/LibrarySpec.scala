package com.cmartin.learn

import com.cmartin.learn.Library._
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import zio.Runtime.{default => runtime}
import zio.Unsafe

class LibrarySpec
    extends AnyFlatSpec
    with Matchers {

  behavior of "Library"

  it should "return the same text" in {
    val result = echo(TEXT)

    result shouldBe TEXT
  }

  it should "sum two numbers" in {
    // given
    val a = 1
    val b = 2

    // when
    val program = sum(a, b)
    val result  = Unsafe.unsafe { implicit u =>
      runtime.unsafe.run(program).getOrThrowFiberFailure()
    }

    // then
    result shouldBe a + b
  }
  
}
