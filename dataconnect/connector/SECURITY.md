# Data Connect authorization hold

The connector operations that accepted `organizationId` were removed because
`@auth(expr: "auth.uid != ''")` authenticated a caller but did not prove that
caller belonged to the requested organization. `GetPalletByQr` was also removed
because an identifier-only lookup could disclose a pallet outside the caller's
organization.

A relation-backed Data Connect authorization expression was not added: this
repository has no Data Connect CLI/package or checked-in syntax reference to
validate the exact expression. Do not replace this hold with guessed `@auth`
directives. Restore operations only after validating the deployed Data Connect
syntax and proving `UserMembership.userId == auth.uid` plus the requested
organization relation for each operation.
