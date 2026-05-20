import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ kicked?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm kicked={params.kicked === "1"} />;
}
