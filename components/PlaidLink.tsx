import React, { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  PlaidLinkOnSuccess,
  PlaidLinkOptions,
  usePlaidLink,
} from "react-plaid-link";
import { useRouter } from "next/navigation";
import {
  createLinkToken,
  exchangePublicToken,
} from "@/lib/actions/user.actions";
import Image from "next/image";

const PlaidLink = ({ user, variant }: PlaidLinkProps) => {
  const router = useRouter();
  const [token, setToken] = useState<string>("");

  /* ---------------- GET TOKEN ---------------- */
  useEffect(() => {
    const getLinkToken = async () => {
      try {
        const data = await createLinkToken(user);

        if (data?.linkToken) {
          setToken(data.linkToken);
        } else {
          console.error("No link token received");
        }
      } catch (error) {
        console.error("Token error:", error);
      }
    };

    getLinkToken();
  }, [user]);

  /* ---------------- SUCCESS ---------------- */
  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (public_token) => {
      try {
        await exchangePublicToken({
          publicToken: public_token,
          user,
        });

        router.push("/");
      } catch (error) {
        console.error("Exchange error:", error);
      }
    },
    [user, router]
  );

  /* ---------------- PLAID HOOK ---------------- */
  const { open, ready } = usePlaidLink(
    token
      ? ({
          token,
          onSuccess,
        } as PlaidLinkOptions)
      : ({} as PlaidLinkOptions)
  );

  /* ---------------- CLICK ---------------- */
  const handleClick = () => {
    console.log("Clicked");
    console.log("Token:", token);

    if (!token || !open) return;

    open();
  };

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={!token || !ready}
        className={
          variant === "ghost"
            ? "plaidlink-ghost"
            : variant === "primary"
            ? "plaidlink-primary"
            : "plaidlink-default"
        }
      >
        <Image
          src="/icons/connect-bank.svg"
          alt="connect bank"
          width={24}
          height={24}
        />
        <p className="text-[16px] font-semibold">Connect bank</p>
      </Button>
    </>
  );
};

export default PlaidLink;