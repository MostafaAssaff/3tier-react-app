// ===================================================================
// Jenkinsfile (Final Production-Ready Version)
// This declarative pipeline automates the entire CI/CD process,
// using kubectl apply with separated Kubernetes manifest files.
// ===================================================================

pipeline {
    // 1. Agent Configuration
    agent any

    // 2. Tools
    // Tells Jenkins to find the 'SonarScanner-latest' tool and add it to the PATH.
    tools {
        'hudson.plugins.sonar.SonarRunnerInstallation' 'SonarScanner-latest'
    }

    // 3. Environment Variables
    environment {
        AWS_REGION         = 'us-west-2'
        ECR_REGISTRY       = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME      = 'my-app-repo'
        EKS_CLUSTER_NAME   = 'my-eks-cluster'
        
        SONAR_CREDENTIALS  = credentials('sonar-token')
        AWS_CREDENTIALS_ID = 'aws-credentials' 
    }

    // 4. Pipeline Stages
    stages {
        
        // ==========================================================
        // Stage 1: Checkout Code
        // ==========================================================
        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        // ==========================================================
        // Stage 2: SonarQube Quality Check
        // ==========================================================
        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('MySonarQubeServer') { 
                    sh 'sonar-scanner'
                }
            }
        }
        
        // ==========================================================
        // Stage 3: Wait for Quality Gate
        // ==========================================================
        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // ==========================================================
        // Stage 4: Build, Scan & Push Application Images
        // ==========================================================
        stage('Build, Scan & Push Images') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            script {
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                                def backendImage = docker.build(imageName, '.')
                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"
                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    backendImage.push()
                                }
                            }
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') {
                            script {
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                                def frontendImage = docker.build(imageName, '.')
                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"
                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    frontendImage.push()
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================================
        // Stage 5: Deploy to EKS using Kubernetes Manifests
        // ==========================================================
        stage('Deploy to EKS') {
            steps {
                script {
                    withAWS(credentials: AWS_CREDENTIALS_ID, region: env.AWS_REGION) {
                        
                        echo "Configuring kubectl for EKS cluster: ${EKS_CLUSTER_NAME}"
                        // Use '--alias' to create a robust kubeconfig context
                        sh "aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${env.AWS_REGION} --alias ${EKS_CLUSTER_NAME}"

                        echo "Applying static Kubernetes manifests..."
                        // Apply all non-deployment manifests first
                        sh "kubectl apply -f ./k8s/01-mongo.yaml"
                        sh "kubectl apply -f ./k8s/04-network-policy.yaml"
                        sh "kubectl apply -f ./k8s/05-ingress.yaml"
                        sh "kubectl apply -f ./k8s/06-ingress-class.yaml"
                        
                        // Now, dynamically update and apply the deployments
                        echo "Deploying updated Backend image..."
                        def backendImage = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                        // Use a temporary file to avoid modifying the git-tracked file
                        sh "sed 's|image:.*|image: ${backendImage}|g' ./k8s/02-backend.yaml > /tmp/backend-deployment.yaml"
                        sh "kubectl apply -f /tmp/backend-deployment.yaml"
                        
                        echo "Deploying updated Frontend image..."
                        def frontendImage = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                        sh "sed 's|image:.*|image: ${frontendImage}|g' ./k8s/03-frontend.yaml > /tmp/frontend-deployment.yaml"
                        sh "kubectl apply -f /tmp/frontend-deployment.yaml"
                    }
                }
            }
        }
    }
    
    // 6. Post-build Actions
    post {
        always {
            script {
                echo "Pipeline finished. Cleaning up workspace."
                cleanWs()
            }
        }
    }
}
