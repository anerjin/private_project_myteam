import { Card } from "@/features/resources/content-types/dev-note/card";
import { Detail } from "@/features/resources/content-types/dev-note/detail";
import { Form } from "@/features/resources/content-types/dev-note/form";
import { meta } from "@/features/resources/content-types/dev-note/meta";
import type { ContentTypeDefinition } from "@/features/resources/content-types/types";

export const devNote: ContentTypeDefinition = { ...meta, Card, Detail, Form };
