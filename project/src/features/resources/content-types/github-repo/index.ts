import { Card } from "@/features/resources/content-types/github-repo/card";
import { Detail } from "@/features/resources/content-types/github-repo/detail";
import { Form } from "@/features/resources/content-types/github-repo/form";
import { meta } from "@/features/resources/content-types/github-repo/meta";
import type { ContentTypeDefinition } from "@/features/resources/content-types/types";

export const githubRepo: ContentTypeDefinition = {
  ...meta,
  Card,
  Detail,
  Form,
};
