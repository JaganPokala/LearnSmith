import { useId } from "react";
import { Link } from "react-router-dom";

export default function AccountMenu({ user, logout }) {
  const id = useId();
  // Native popovers dismiss on outside click and Escape without a global listener.
  return (
    <>
      <button type="button" popoverTarget={id} className="account-trigger">
        {user?.name?.split(" ")[0] || "Account"} ⌄
      </button>
      <div id={id} popover="auto" className="account-popover">
        <p>{user?.email || "Signed in"}</p>
        <Link
          to="/billing"
          onClick={(event) =>
            event.currentTarget.closest("[popover]").hidePopover()
          }
        >
          Manage plan
        </Link>
        <button
          type="button"
          onClick={() =>
            logout({ logoutParams: { returnTo: window.location.origin } })
          }
        >
          Sign out
        </button>
      </div>
    </>
  );
}
