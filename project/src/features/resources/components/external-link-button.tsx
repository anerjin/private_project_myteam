import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ExternalLinkButton({ url }: { url: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="size-4" />
        원본 열기
      </a>
    </Button>
  );
}
