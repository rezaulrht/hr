import { EmployeeDetailPage } from "@/components/profile/employee-detail-page"

export default async function Page({ params }: PageProps<"/admin/employees/[id]">) {
  const { id } = await params
  return <EmployeeDetailPage employeeId={id} backHref="/admin/employees" />
}
