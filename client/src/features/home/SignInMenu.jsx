import { useEffect, useRef } from "react";
import SignInActions from "../../components/SignInActions.jsx";

export default function SignInMenu() {
  const menu = useRef(null);

  useEffect(() => {
    // Listen on the document so clicks elsewhere dismiss this native disclosure.
    function dismissOutside(event) {
      if (menu.current && !menu.current.contains(event.target))
        menu.current.open = false;
    }
    function dismissWithEscape(event) {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary").focus();
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, []);

  return (
    <details ref={menu} className="home-sign-in">
      <summary>Sign in</summary>
      <div>
        <SignInActions returnTo="/" />
      </div>
    </details>
  );
}
