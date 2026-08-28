import { redirect } from "next/navigation";

/** 로그인 여부에 따라 분기한다. 지금은 인증이 없으므로 로그인 화면으로 보낸다. */
export default function Home() {
  redirect("/login");
}
