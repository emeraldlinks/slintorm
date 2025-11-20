export declare const schema: {
    User: {
        primaryKey: string;
        fields: {
            id: {
                type: string;
                meta: {
                    index: boolean;
                    auto: boolean;
                    primaryKey: boolean;
                };
            };
            firstName: {
                type: string;
                meta: {};
            };
            name: {
                type: string;
                meta: {};
            };
            lastname: {
                type: string;
                meta: {};
            };
            posts: {
                type: string;
                meta: {
                    "relation onetomany": string;
                    foreignKey: string;
                };
            };
            profile: {
                type: string;
                meta: {
                    "relationship onetoone": string;
                    foreignKey: string;
                };
            };
            createdAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
            updatedAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
        };
        relations: never[];
        table: string;
    };
    Post: {
        primaryKey: string;
        fields: {
            id: {
                type: string;
                meta: {
                    index: boolean;
                    auto: boolean;
                    primaryKey: boolean;
                };
            };
            title: {
                type: string;
                meta: {};
            };
            userId: {
                type: string;
                meta: {};
            };
            user: {
                type: string;
                meta: {
                    "relation manytoone": string;
                    foreignKey: string;
                };
            };
            createdAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
            updatedAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
        };
        relations: never[];
        table: string;
    };
    Todo: {
        primaryKey: string;
        fields: {
            id: {
                type: string;
                meta: {
                    index: boolean;
                    auto: boolean;
                    primaryKey: boolean;
                };
            };
            title: {
                type: string;
                meta: {};
            };
            detail: {
                type: string;
                meta: {};
            };
            createdAt: {
                type: string;
                meta: {};
            };
            updatedAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
        };
        relations: never[];
        table: string;
    };
    Profile: {
        primaryKey: string;
        fields: {
            id: {
                type: string;
                meta: {
                    index: boolean;
                    auto: boolean;
                    primaryKey: boolean;
                };
            };
            user: {
                type: string;
                meta: {
                    "relationship onetoone": string;
                    foreignKey: string;
                };
            };
            userId: {
                type: string;
                meta: {};
            };
            createdAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
            updatedAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
        };
        relations: never[];
        table: string;
    };
    Task: {
        primaryKey: string;
        fields: {
            id: {
                type: string;
                meta: {
                    index: boolean;
                    auto: boolean;
                    primaryKey: boolean;
                };
            };
            title: {
                type: string;
                meta: {};
            };
            detail: {
                type: string;
                meta: {};
            };
            createdAt: {
                type: string;
                meta: {};
            };
            updatedAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
        };
        relations: never[];
        table: string;
    };
    Tasksx: {
        primaryKey: string;
        fields: {
            id: {
                type: string;
                meta: {
                    index: boolean;
                    auto: boolean;
                    primaryKey: boolean;
                };
            };
            title: {
                type: string;
                meta: {};
            };
            detail: {
                type: string;
                meta: {};
            };
            createdAt: {
                type: string;
                meta: {};
            };
            updatedAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
        };
        relations: never[];
        table: string;
    };
    Team: {
        primaryKey: string;
        fields: {
            id: {
                type: string;
                meta: {
                    index: boolean;
                    auto: boolean;
                    primaryKey: boolean;
                };
            };
            title: {
                type: string;
                meta: {};
            };
            detail: {
                type: string;
                meta: {};
            };
            open: {
                type: string;
                meta: {};
            };
            tested: {
                type: string;
                meta: {};
            };
            createdAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
            updatedAt: {
                type: string;
                meta: {
                    index: boolean;
                    default: string;
                };
            };
        };
        relations: never[];
        table: string;
    };
};
