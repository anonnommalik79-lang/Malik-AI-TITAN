import "./auth-isolation.css";
import { AuthBodyLock } from "./auth-body-lock";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="malik-auth-page" data-auth-mobile="v1">
      <AuthBodyLock />
      {children}
    </div>
  );
}
