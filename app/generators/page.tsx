import type { Metadata } from "next";
import { MediaGenerator } from "@/components/generator/MediaGenerator";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "AI Generator — MALIK AI STUDIO",
  description: "Premium AI генератор фото и видео с ротацией провайдеров и Pro доступом."
};

export default function GeneratorPage() {
  return (
    <Section className="pt-14">
      <Container>
        <div className="mx-auto mb-10 max-w-4xl text-center">
          <Badge>AI Media Lab</Badge>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-6xl">Генератор фото и видео уровня premium studio</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-400">
            Один бесплатный запуск для обычного пользователя. Дальше Pro доступ. Провайдеры меняются по очереди и подхватывают задачу, если один не отвечает.
          </p>
        </div>
        <MediaGenerator />
      </Container>
    </Section>
  );
}
