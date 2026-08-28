import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 justify-center px-4 pb-16">
        <div className="w-full self-center">{children}</div>
      </div>
    </div>
  );
}
