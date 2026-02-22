export function mapAuthError(message: string) {
  const lower = (message || "").toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (lower.includes("email not confirmed") || lower.includes("email address not confirmed")) {
    return "Please confirm your email before logging in.";
  }
  if (lower.includes("already registered") || lower.includes("user already registered")) {
    return "This email already has an account. Log in instead.";
  }
  if (lower.includes("password")) {
    return "Password does not meet requirements. Use at least 6 characters.";
  }
  if (lower.includes("rate limit")) {
    return "Too many attempts. Please wait and try again.";
  }
  return "We could not complete this request. Please try again.";
}

