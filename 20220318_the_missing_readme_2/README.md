# The Missing README

## 4 WRITING OPERABLE CODE

### Configuration

- Static configuration file
- Log and validate all Configuration in application startup.
- Group related properties.
- rigor, disastrous
- Don't edit deployed configuration
    - > If you edit configuration manually during a production incident, make sure changes get commited to the source of truth(the VCS) later

### Tools

> Operable systems come with tools that help operators run the application.
>
> - bulk-load data
> - run a recovery
> - reset database state
> - tirgger a leadership election
> - shift a partition assignment from one machine to another
>
> Systems should come with tools to help operators deal with common operations.

- strong SRE teams
- > Regardless, work with your operations team to understand what they need.

### Amazon brings down the internet

- AWS S3 storage system was down on 2017-02-18
- This was impacting basically the entire internet.
- Simple typo caused this trouble.

### Do's and Don'ts

| Do's | Don'ts|
|:-|:-|
| **Do** prefer compilation errors to runtime errors.                                             | **Don't** use exceptions for application logics.             |
| **Do** make things immutable whatever possible.                                                 | **Don't** use return codes for exception handling.           |
| **Do** validate inputs and outputs.                                                             | **Don't** catch exceptions that you can't handle.            |
| **Do** study the OWASP Top 10..                                                                 | **Don't** write multiline logs.                              |
| **Do** use bug-checking tools and types or type hinting.                                        | **Don't** write secrets or sensitive data to logs.           |
| **Do** clean up resources after exceptions<br>(especially sockets, file pointers and memories). | **Don't** manually edit configuration on a machine.          |
| **Do** instruct your code with metrics.                                                         | **Don't** store passwords or secrets in configuration files. |
| **Do** make your application configurable.                                                      | **Don't** write custom configuration formats.                |
| **Do** validate and log all configuration.                                                      | **Don't** use dynamic configuration if you can avoid it.     |

