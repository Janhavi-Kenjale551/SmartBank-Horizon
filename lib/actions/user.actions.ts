'use server';

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, parseStringify } from "../utils";
import {
  CountryCode,
  ProcessorTokenCreateRequest,
  ProcessorTokenCreateRequestProcessorEnum,
  Products
} from "plaid";

import { plaidClient } from "@/lib/plaid";
import { revalidatePath } from "next/cache";
import { addFundingSource } from "./dwolla.actions";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

/* ---------------- USER INFO ---------------- */

export const getUserInfo = async ({ userId }: getUserInfoProps) => {
  try {
    const { database } = await createAdminClient();

    const user = await database.listDocuments(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      [Query.equal("userId", [userId])]
    );

    return user.documents?.[0] || null;

  } catch (error) {
    console.log("getUserInfo error:", error);
    return null;
  }
};

/* ---------------- SIGN IN ---------------- */

export const signIn = async ({ email, password }: signInProps) => {
  try {
    const { account } = await createAdminClient();

    const session = await account.createEmailPasswordSession(email, password);

    cookies().set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    const user = await getUserInfo({ userId: session.userId });

    return user ? parseStringify(user) : null;

  } catch (error) {
    console.error("SIGNIN ERROR:", error);
    return null;
  }
};

/* ---------------- SIGN UP ---------------- */

export const signUp = async ({ password, ...userData }: SignUpParams) => {
  try {
    console.log("SIGNUP START");

    const { email, firstName, lastName } = userData;
    const { account, database } = await createAdminClient();

    const newUserAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`
    );

    if (!newUserAccount) throw new Error("User creation failed");

    /* ---------------- DWOLLA BYPASS (DEV SAFE) ---------------- */
    const dwollaCustomerUrl = "test-url";
    const dwollaCustomerId = "test-id";

    console.log("Creating user document...");

    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        ...userData,
        userId: newUserAccount.$id,
        dwollaCustomerId,
        dwollaCustomerUrl,
      }
    );

    console.log("User document created");

    const session = await account.createEmailPasswordSession(email, password);

    cookies().set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    return parseStringify(newUser);

  } catch (error) {
    console.error("SIGNUP ERROR:", error);
    return null;
  }
};

/* ---------------- LOGGED IN USER ---------------- */

export async function getLoggedInUser() {
  try {
    const { account } = await createSessionClient();

    const result = await account.get();

    const user = await getUserInfo({ userId: result.$id });

    return user ? parseStringify(user) : null;

  } catch (error) {
    console.log("getLoggedInUser error:", error);
    return null;
  }
}

/* ---------------- LOGOUT ---------------- */

export const logoutAccount = async () => {
  try {
    const { account } = await createSessionClient();

    cookies().delete("appwrite-session");

    await account.deleteSession("current");
  } catch (error) {
    console.log("logout error:", error);
  }
};

/* ---------------- LINK TOKEN ---------------- */

export const createLinkToken = async (user: User) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.$id },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ["auth"] as Products[],
      language: "en",
      country_codes: ["US"] as CountryCode[],
    });

    return parseStringify({ linkToken: response.data.link_token });

  } catch (error) {
    console.log("link token error:", error);
    return null;
  }
};

/* ---------------- BANK ACCOUNT ---------------- */

export const createBankAccount = async (data: createBankAccountProps) => {
  try {
    const { database } = await createAdminClient();

    const bankAccount = await database.createDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      ID.unique(),
      data
    );

    return parseStringify(bankAccount);

  } catch (error) {
    console.log("bank create error:", error);
    return null;
  }
};

/* ---------------- PLAID EXCHANGE ---------------- */

export const exchangePublicToken = async ({
  publicToken,
  user,
}: exchangePublicTokenProps) => {
  try {
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accountData = accountsResponse.data.accounts[0];

    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
    };

    const processorTokenResponse =
      await plaidClient.processorTokenCreate(request);

    const processorToken =
      processorTokenResponse.data.processor_token;

   const fundingSourceUrl = "test-url";

    await createBankAccount({
      userId: user.$id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl: "test-url",
      shareableId: encryptId(accountData.account_id),
    });

    revalidatePath("/");

    return parseStringify({ publicTokenExchange: "complete" });

  } catch (error) {
    console.error("PLAID EXCHANGE ERROR:", error);
    return null;
  }
};

/* ---------------- BANK QUERIES ---------------- */

export const getBanks = async ({ userId }: getBanksProps) => {
  try {
    const { database } = await createAdminClient();

    const banks = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal("userId", [userId])]
    );

    return parseStringify(banks.documents);

  } catch (error) {
    console.log(error);
    return null;
  }
};

export const getBank = async ({ documentId }: getBankProps) => {
  try {
    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal("$id", [documentId])]
    );

    return parseStringify(bank.documents[0]);

  } catch (error) {
    console.log(error);
    return null;
  }
};

export const getBankByAccountId = async ({
  accountId,
}: getBankByAccountIdProps) => {
  try {
    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal("accountId", [accountId])]
    );

    if (bank.total !== 1) return null;

    return parseStringify(bank.documents[0]);

  } catch (error) {
    console.log(error);
    return null;
  }
};