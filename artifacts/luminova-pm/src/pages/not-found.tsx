import { useLocation } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, setLocation] = useLocation();
  
  return (
    <>
      <div className="flex w-full flex-1 items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-heading font-bold">Page not found</h1>
            <p className="text-muted-foreground">
              The page you are looking for doesn't exist or has been moved.
            </p>
          </div>
          <Button onClick={() => setLocation("/")} className="mt-4">
            Return to Dashboard
          </Button>
        </div>
      </div>
    </>
  );
}