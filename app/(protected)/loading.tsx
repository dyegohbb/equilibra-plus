import { LoadingState } from "@/components/ui/spinner";

export default function ProtectedLoading() {
  return <div className="full-page-loading"><LoadingState label="Abrindo sua área financeira…"/></div>;
}
