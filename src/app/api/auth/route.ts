import { NextResponse } from "next/server";

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;

export async function GET() {
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=repo,user`;
  return NextResponse.redirect(authUrl);
}
