"use client";

import * as React from "react";
import { Drawer as VaulDrawer } from "vaul";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

// Vaul drawer animations (local copy – vaul package doesn’t expose style.css to bundler)
import "@/app/vaul-drawer.css";

import { useTranslations } from "next-intl";
function Drawer({
  open,
  onOpenChange,
  direction = "bottom",
  ...props
}: React.ComponentProps<typeof VaulDrawer.Root>) {
  return (
    <VaulDrawer.Root
      direction={direction}
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  );
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof VaulDrawer.Trigger>) {
  return <VaulDrawer.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof VaulDrawer.Portal>) {
  return <VaulDrawer.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Overlay>) {
  return (
    <VaulDrawer.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  showHandle = true,
  showCloseButton = true,
  fullScreen = false,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Content> & {
  showHandle?: boolean;
  showCloseButton?: boolean;
  fullScreen?: boolean;
}) {
    const t = useTranslations("common");
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <VaulDrawer.Content
        data-slot="drawer-content"
        className={cn(
          "fixed z-50 flex min-h-0 flex-col bg-background shadow-lg transition-transform",
          fullScreen
            ? "inset-0 h-screen w-screen rounded-none"
            : cn(
                "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:rounded-t-[10px] data-[vaul-drawer-direction=bottom]:border-t",
                "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:rounded-b-[10px] data-[vaul-drawer-direction=top]:border-b",
                "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:h-full data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:max-w-sm data-[vaul-drawer-direction=left]:rounded-e-[10px] data-[vaul-drawer-direction=left]:border-e",
                "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:max-w-sm data-[vaul-drawer-direction=right]:rounded-s-[10px] data-[vaul-drawer-direction=right]:border-s"
              ),
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[vaul-drawer-direction=bottom]:data-[state=closed]:slide-out-to-bottom data-[vaul-drawer-direction=bottom]:data-[state=open]:slide-in-from-bottom",
          "data-[vaul-drawer-direction=top]:data-[state=closed]:slide-out-to-top data-[vaul-drawer-direction=top]:data-[state=open]:slide-in-from-top",
          "data-[vaul-drawer-direction=left]:data-[state=closed]:slide-out-to-left data-[vaul-drawer-direction=left]:data-[state=open]:slide-in-from-left",
          "data-[vaul-drawer-direction=right]:data-[state=closed]:slide-out-to-right data-[vaul-drawer-direction=right]:data-[state=open]:slide-in-from-right",
          className
        )}
        {...props}
      >
        {showHandle && !fullScreen && (
          <div className="mx-auto mt-4 flex h-1.5 w-12 shrink-0 rounded-full bg-muted data-[vaul-drawer-direction=top]:mt-4 data-[vaul-drawer-direction=top]:mb-4" />
        )}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden isolate">
          {showCloseButton && (
            <VaulDrawer.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute end-4 top-4 z-10"
              >
                <XIcon className="h-4 w-4" />
                <span className="sr-only">{t("actions.close")}</span>
              </Button>
            </VaulDrawer.Close>
          )}
          {children}
        </div>
      </VaulDrawer.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("grid gap-1.5 p-4 text-start [text-rendering:optimizeLegibility] antialiased", className)}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Title>) {
  return (
    <VaulDrawer.Title
      data-slot="drawer-title"
      className={cn("text-lg font-semibold leading-none", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Description>) {
  return (
    <VaulDrawer.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof VaulDrawer.Close>) {
  return <VaulDrawer.Close data-slot="drawer-close" {...props} />;
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
};
