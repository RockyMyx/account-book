import { defineStore } from 'pinia'
import api from '../api'

interface Category {
  id: string
  name: string
  icon: string | null
  direction: 'income' | 'expense'
  tag: string // fixed | variable | rigid | flexible | earmark
  sortNo: number
  isBuiltin: boolean
}

interface MemberInfo {
  memberId: string
  name: string
  role: string
}

export const useAppStore = defineStore('app', {
  state: () => ({
    member: JSON.parse(localStorage.getItem('ab_member') || 'null') as MemberInfo | null,
    categories: [] as Category[],
  }),
  getters: {
    expenseCategories: (s) =>
      s.categories
        .filter((c) => c.direction === 'expense')
        .sort((a, b) => a.sortNo - b.sortNo),
    incomeCategories: (s) =>
      s.categories
        .filter((c) => c.direction === 'income')
        .sort((a, b) => a.sortNo - b.sortNo),
  },
  actions: {
    async loadCategories() {
      if (this.categories.length) return
      const { data } = await api.get('/categories')
      this.categories = data
    },
    setMember(m: MemberInfo) {
      this.member = m
      localStorage.setItem('ab_member', JSON.stringify(m))
    },
    logout() {
      localStorage.removeItem('ab_token')
      localStorage.removeItem('ab_member')
      this.member = null
    },
  },
})
