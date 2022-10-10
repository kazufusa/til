import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.diagrams.Diagrams
import org.scalatest.matchers.should.Matchers
import zio._
import zio.Runtime.{default => runtime}
import zio.Unsafe

class ZioSpec extends AnyFlatSpec with Diagrams with Matchers {

  // def sum(a: Int, b: Int): UIO[Int] = {
  def sum(a: Int, b: Int): Task[Int] = {
    ZIO.succeed(a + b)
  }

  it should "sum two numbers" in {
    // given
    val a = 1
    val b = 2

    // when
    val program = sum(a, b)
    val result = Unsafe.unsafe { implicit u =>
      runtime.unsafe.run(program).getOrThrowFiberFailure()
    }

    // then
    result shouldBe a + b
    // or
    assert(result === a + b)
  }

  "Runtime fiber_started metric" should "be picked up by our OTEL instrumentations" in {
    val program = for {
      fiber1 <- ZIO.succeed(1).fork
      fiber2 <- ZIO.succeed(1).fork
      _      <- fiber1.join
      _      <- fiber2.join
    } yield ()

    val result = Unsafe.unsafe { implicit u =>
      runtime.unsafe.run(program).getOrThrowFiberFailure()
    }
    assert(result === ())
  }
}
