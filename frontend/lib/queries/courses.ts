import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCourse,
  deleteCourse,
  listCourses,
  listCoursesPage,
  updateCourse,
  type CourseInput,
  type ListCoursesPageParams,
  type ListCoursesParams,
} from "@/lib/api/courses";

const coursesKey = (params: ListCoursesParams) => ["courses", params] as const;
const coursesPageKey = (params: ListCoursesPageParams) => ["courses-page", params] as const;

export function useCoursesQuery(params: ListCoursesParams) {
  return useQuery({
    queryKey: coursesKey(params),
    queryFn: () => listCourses(params),
  });
}

export function useCoursesPageQuery(params: ListCoursesPageParams) {
  return useQuery({
    queryKey: coursesPageKey(params),
    queryFn: () => listCoursesPage(params),
    placeholderData: (previous) => previous,
  });
}

export function useCreateCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CourseInput) => createCourse(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses-page"] });
    },
  });
}

export function useUpdateCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, input }: { courseId: string; input: Partial<CourseInput> }) =>
      updateCourse(courseId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses-page"] });
    },
  });
}

export function useDeleteCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => deleteCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses-page"] });
    },
  });
}
