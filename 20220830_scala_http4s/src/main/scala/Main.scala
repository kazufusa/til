import cats.effect.IO
import cats.effect.unsafe.implicits.global
import io.circe.generic.auto._
import org.http4s.{EntityDecoder, _}
import org.http4s.circe.jsonOf
import org.http4s.Method.GET
import org.http4s.client.dsl.io._
import org.http4s.ember.client.EmberClientBuilder
import org.http4s.headers.{Accept, Authorization}

case class Response(msg: Seq[String])

object Main extends App {
  implicit val responseEntityDecoder: EntityDecoder[IO, Response] =
    jsonOf[IO, Response]
  val url = "http://localhost:3000/api"

  val program = EmberClientBuilder.default[IO].build.use { client =>
    // response <- client.expect[Response] (url)

    //    val request = GET(
    //      uri"https://my-lovely-api.com/",
    //      Authorization(Credentials.Token(AuthScheme.Bearer, "open sesame")),
    //      Accept(MediaType.application.json)
    //    )
    val request = GET(
      Uri.unsafeFromString(url),
      Authorization(Credentials.Token(AuthScheme.Bearer, "open sesame")),
      Accept(MediaType.application.json)
    )
    client.expect[Response](request)

    //    for {
    //      // uri <- IO.fromEither(Uri.fromString(url))
    //      // response <- client.expect[Response](uri)
    //      //      response <- client.expect[Response](Uri.unsafeFromString(url))
    //      // response <- client.expect[Response](Method.GET, uri)
    //       response <- client.expect[Response](request)
    //    } yield response
  }
  program.unsafeRunSync().msg.map(println(_))
}
