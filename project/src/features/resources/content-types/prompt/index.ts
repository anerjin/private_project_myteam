import { Card } from "@/features/resources/content-types/prompt/card";
import { Detail } from "@/features/resources/content-types/prompt/detail";
import { Form } from "@/features/resources/content-types/prompt/form";
import { meta } from "@/features/resources/content-types/prompt/meta";
import type { ContentTypeDefinition } from "@/features/resources/content-types/types";

export const prompt: ContentTypeDefinition = { ...meta, Card, Detail, Form };
