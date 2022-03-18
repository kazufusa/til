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
