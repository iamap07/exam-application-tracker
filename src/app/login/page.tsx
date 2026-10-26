import { LoginForm } from "@/components/client/AuthForms";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Exam Application Tracker</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Sign in with the email your administrator invited.</p>
      <LoginForm error={error} />
    </main>
  );
}
