"use client"

import type { ReactNode } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import styles from "./account-panels.module.css"

export function AccountDialog({ title, description, onClose, children, wide = false }: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog + (wide ? " " + styles.wide : "")}>
          <header className={styles.header}>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <Dialog.Description className={styles.subtitle}>{description}</Dialog.Description>
          </header>
          <Dialog.Close className={styles.close} aria-label="Закрыть окно"><X size={20} /></Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
