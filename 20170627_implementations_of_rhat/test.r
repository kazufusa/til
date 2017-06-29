library(coda)
library(ggmcmc)
data(radon)
gg <- ggs(radon$s.radon.short)

gelman.diag(radon$s.radon.short)
ggs_Rhat <- function(D, family=NA, scaling=1.5, greek=FALSE) {
  if (attributes(D)$nChains<2) {
    stop("At least two chains are required")
  }
  # Manage subsetting a family of parameters
  if (!is.na(family)) {
    D <- get_family(D, family=family)
  }
  # The computations follow BDA, pg 296-297, and the notation tries to be
  # consistent with it
  # Compute between-sequence variance using psi.. and psi.j
  # a
  psi.dot <- D %>%
    dplyr::group_by(Parameter, Chain) %>%
    dplyr::summarize(psi.dot=mean(value))
  psi.j <- D %>%
    dplyr::group_by(Parameter) %>%
    dplyr::summarize(psi.j=mean(value))
  b.df <- dplyr::inner_join(psi.dot, psi.j, by="Parameter")
  B <- b.df %>%
    dplyr::group_by(Parameter) %>%
    dplyr::summarize(B=var(psi.j-psi.dot)*attributes(D)$nIterations)
  B <- unique(B)
  # Compute within-sequence variance using s2j
  s2j <- D %>%
    dplyr::group_by(Parameter, Chain) %>%
    dplyr::summarize(s2j=var(value))
  W <- s2j %>%
    dplyr::group_by(Parameter) %>%
    dplyr::summarize(W=mean(s2j))
  # Merge BW and compute the weighted average (wa, var.hat+) and the Rhat
  BW <- dplyr::inner_join(B, W, by="Parameter") %>%
    dplyr::mutate(
      wa= (((attributes(D)$nIterations-1)/attributes(D)$nIterations )* W) +
        ((1/ attributes(D)$nIterations)*B),
      Rhat=sqrt(wa/W))
  # For parameters that do not vary, Rhat is Nan. Move it to NA
  BW$Rhat[is.nan(BW$Rhat)] <- NA
  BW
}
ggs_Rhat(gg)

gelman.diag <- function (x, confidence = 0.95, transform = FALSE, autoburnin = TRUE,
    multivariate = TRUE)
{
    x <- as.mcmc.list(x)
    if (nchain(x) < 2)
        stop("You need at least two chains")
    if (autoburnin && start(x) < end(x)/2)
        x <- window(x, start = end(x)/2 + 1)
    Niter <- niter(x)
    Nchain <- nchain(x)
    Nvar <- nvar(x)
    xnames <- varnames(x)
    if (transform)
        x <- gelman.transform(x)
    x <- lapply(x, as.matrix)
    S2 <- array(sapply(x, var, simplify = TRUE), dim = c(Nvar,
        Nvar, Nchain))
    W <- apply(S2, c(1, 2), mean)
    xbar <- matrix(sapply(x, apply, 2, mean, simplify = TRUE),
        nrow = Nvar, ncol = Nchain)
    B <- Niter * var(t(xbar))
    if (Nvar > 1 && multivariate) {
        if (is.R()) {
            CW <- chol(W)
            emax <- eigen(backsolve(CW, t(backsolve(CW, B, transpose = TRUE)),
                transpose = TRUE), symmetric = TRUE, only.values = TRUE)$values[1]
        }
        else {
            emax <- eigen(qr.solve(W, B), symmetric = FALSE,
                only.values = TRUE)$values
        }
        mpsrf <- sqrt((1 - 1/Niter) + (1 + 1/Nvar) * emax/Niter)
    }
    else mpsrf <- NULL
    w <- diag(W)
    b <- diag(B)
    s2 <- matrix(apply(S2, 3, diag), nrow = Nvar, ncol = Nchain)
    muhat <- apply(xbar, 1, mean)
    var.w <- apply(s2, 1, var)/Nchain
    var.b <- (2 * b^2)/(Nchain - 1)
    cov.wb <- (Niter/Nchain) * diag(var(t(s2), t(xbar^2)) - 2 *
        muhat * var(t(s2), t(xbar)))
    V <- (Niter - 1) * w/Niter + (1 + 1/Nchain) * b/Niter
    var.V <- ((Niter - 1)^2 * var.w + (1 + 1/Nchain)^2 * var.b +
        2 * (Niter - 1) * (1 + 1/Nchain) * cov.wb)/Niter^2
    df.V <- (2 * V^2)/var.V
    df.adj <- (df.V + 3)/(df.V + 1)
    B.df <- Nchain - 1
    W.df <- (2 * w^2)/var.w
    R2.fixed <- (Niter - 1)/Niter
    R2.random <- (1 + 1/Nchain) * (1/Niter) * (b/w)
    R2.estimate <- R2.fixed + R2.random
    R2.upper <- R2.fixed + qf((1 + confidence)/2, B.df, W.df) *
        R2.random
    psrf <- cbind(sqrt(df.adj * R2.estimate), sqrt(df.adj * R2.upper))
    dimnames(psrf) <- list(xnames, c("Point est.", "Upper C.I."))
    out <- list(psrf = psrf, mpsrf = mpsrf)
    class(out) <- "gelman.diag"
    out
}
